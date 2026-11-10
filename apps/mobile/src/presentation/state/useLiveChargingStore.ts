import { create } from 'zustand';
import { env } from '@/core/config/env';
import { Invoice } from '@/domain/entities/Invoice';
import { HttpDashboardRepository } from '@/infrastructure/repositories/HttpDashboardRepository';
import { HttpReservationRepository } from '@/infrastructure/repositories/HttpReservationRepository';
import { OpenChargingSessionUseCase } from '@/application/use-cases/OpenChargingSessionUseCase';
import { useAuthStore } from './useAuthStore';

const dashboard = new HttpDashboardRepository();
const reservations = new HttpReservationRepository();
const openSession = new OpenChargingSessionUseCase(reservations);

export interface CompletedInvoice {
  stationName: string; chargerId: string; energyKwh: number; pricePerKwh: number;
  totalAmount: number; elapsedSeconds: number; issuedAt: string; source: 'BILLING' | 'DEMO';
}
export interface LiveSessionState {
  isCharging: boolean; stationName: string; chargerId: string; reservationId: string | null; sessionId: string | null;
  powerKw: number; energyKwh: number; targetKwh: number; batteryPercent: number;
  pricePerKwh: number; elapsedSeconds: number; wsConnected: boolean;
  pendingInvoice: boolean; error: string | null;
  lastInvoice: CompletedInvoice | null; invoiceHistory: Invoice[]; degradedServices: string[];
  startCharging: (stationName: string, chargerId: string, powerKw: number, pricePerKwh: number) => Promise<void>;
  stopCharging: () => Promise<void>;
  clearInvoice: () => void;
  fetchDashboardInvoices: () => Promise<void>;
  updateTelemetry: (powerKw: number, energyKwh: number) => void;
  reset: () => void;
}
let timer: ReturnType<typeof setInterval> | null = null;
let ws: WebSocket | null = null;
let sessionSeq = 0;
const TARGET_KWH = 48;
const battery = (kwh: number) => Math.min(100, Math.round(20 + kwh / TARGET_KWH * 80));
function clearTimer() { if (timer) clearInterval(timer); timer = null; }
function closeSocket() { ws?.close(); ws = null; }

export const useLiveChargingStore = create<LiveSessionState>((set, get) => ({
  isCharging: false, stationName: 'VoltHub Diamond Lourdes', chargerId: 'BH-LOU-01', reservationId: null, sessionId: null,
  powerKw: 0, energyKwh: 0, targetKwh: TARGET_KWH, batteryPercent: 20, pricePerKwh: 2.29,
  elapsedSeconds: 0, wsConnected: false, pendingInvoice: false, error: null,
  lastInvoice: null, invoiceHistory: [], degradedServices: [],

  fetchDashboardInvoices: async () => {
    const token = useAuthStore.getState().user?.token;
    if (!token) return;
    const res = await dashboard.getDriverDashboard(token);
    if (res.ok) {
      set({ invoiceHistory: res.value.invoices, degradedServices: res.value.degradedServices });
      const st = get();
      const invoice = res.value.invoices.find(i => i.sessionId === st.sessionId);
      if (invoice && !st.lastInvoice) {
        clearTimer(); closeSocket();
        set({ isCharging: false, pendingInvoice: false, error: null, powerKw: 0,
          energyKwh: invoice.energyKwh, lastInvoice: {
            stationName: st.stationName, chargerId: invoice.chargerId, energyKwh: invoice.energyKwh,
            pricePerKwh: invoice.pricePerKwh.amount, totalAmount: invoice.amount.amount,
            elapsedSeconds: st.elapsedSeconds, issuedAt: invoice.formattedTime, source: 'BILLING',
          } });
      }
    } else set({ error: res.error.message });
  },

  startCharging: async (stationName, chargerId, powerKw, pricePerKwh) => {
    if (get().isCharging || get().pendingInvoice) return;
    const seq = ++sessionSeq;
    const stale = () => seq !== sessionSeq;
    clearTimer(); closeSocket();
    const user = useAuthStore.getState().user;
    if (!user) return;
    const demo = user.isOffline;
    set({ isCharging: true, stationName, chargerId, reservationId: null, sessionId: null, powerKw: 0, energyKwh: 0,
      targetKwh: TARGET_KWH, batteryPercent: 20, pricePerKwh, elapsedSeconds: 0,
      wsConnected: false, lastInvoice: null, error: null, pendingInvoice: false });

    // A sessão autenticada só recebe kWh/potência do backend. O relógio é local.
    timer = setInterval(() => {
      if (!get().isCharging) return;
      const st = get();
      set({ elapsedSeconds: st.elapsedSeconds + 1 });
      if (!demo) return;
      const kwh = Math.min(TARGET_KWH, st.energyKwh + powerKw / 60);
      set({ energyKwh: kwh, powerKw, batteryPercent: battery(kwh) });
      if (kwh >= TARGET_KWH) void get().stopCharging();
    }, 1000);
    if (demo) return;

    try {
      // Inscreve antes do POST /start para não perder session-started/primeiras leituras.
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`${env.wsUrl}?access_token=${encodeURIComponent(user.token)}`);
        ws = socket;
        const timeout = setTimeout(() => { socket.close(); reject(new Error('Tempo limite ao conectar telemetria')); }, 5000);
        socket.onmessage = event => {
          if (stale()) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'hello') { clearTimeout(timeout); set({ wsConnected: true }); resolve(); return; }
            if (msg.chargerId !== chargerId) return;
            if (msg.type === 'session-started' && msg.reservationId === get().reservationId) set({ sessionId: msg.sessionId });
            if (!get().sessionId || msg.sessionId !== get().sessionId || get().lastInvoice) return;
            if (msg.type === 'meter' && typeof msg.energyKwh === 'number') {
              set({ energyKwh: msg.energyKwh, powerKw: msg.powerKw ?? 0, batteryPercent: battery(msg.energyKwh) });
            } else if (msg.type === 'session-ended') {
              clearTimer(); set({ isCharging: false, powerKw: 0, pendingInvoice: true });
            } else if (msg.type === 'invoice' && typeof msg.amount === 'number') {
              clearTimer();
              const st = get();
              set({ isCharging: false, pendingInvoice: false, powerKw: 0, energyKwh: msg.energyKwh,
                batteryPercent: battery(msg.energyKwh), lastInvoice: {
                  stationName, chargerId, energyKwh: msg.energyKwh, pricePerKwh: msg.pricePerKwh ?? pricePerKwh,
                  totalAmount: msg.amount, elapsedSeconds: st.elapsedSeconds,
                  issuedAt: new Date().toLocaleTimeString('pt-BR'), source: 'BILLING',
                } });
              void get().fetchDashboardInvoices();
              socket.close();
            }
          } catch { /* Payload não reconhecido não altera a sessão. */ }
        };
        socket.onerror = () => { clearTimeout(timeout); reject(new Error('Falha ao conectar telemetria')); };
        socket.onclose = () => {
          clearTimeout(timeout);
          reject(new Error('Conexão de telemetria encerrada'));
          if (!stale()) set({ wsConnected: false,
            ...(get().isCharging || get().pendingInvoice ? { error: 'Telemetria desconectada. Verifique a reserva e atualize o histórico de faturas.' } : {}) });
        };
      });
      if (stale()) return;
      const reservationId = await openSession.execute(chargerId, user.token, stale, (id, sessionId) => { if (!stale()) set({ reservationId: id, sessionId: sessionId ?? null }); });
      if (stale()) return;
      if (!reservationId) throw new Error('Não foi possível iniciar a reserva. Verifique a disponibilidade do conector.');
    } catch (err) {
      if (stale()) return;
      clearTimer(); closeSocket();
      set({ isCharging: false, wsConnected: false, reservationId: null, error: (err as Error).message });
    }
  },

  stopCharging: async () => {
    const st = get();
    const user = useAuthStore.getState().user;
    if (user?.token && st.reservationId) {
      const result = await reservations.cancel(st.reservationId, user.token);
      if (!result.ok) { set({ error: result.error.message }); return; }
      // Mantém o WS para receber a fatura emitida após o encerramento físico.
      clearTimer(); set({ isCharging: false, pendingInvoice: true, powerKw: 0 });
      return;
    }
    sessionSeq++; clearTimer(); closeSocket();
    set({ isCharging: false, wsConnected: false, reservationId: null,
      lastInvoice: user?.isOffline && st.energyKwh > 0 ? {
        stationName: st.stationName, chargerId: st.chargerId, energyKwh: st.energyKwh,
        pricePerKwh: st.pricePerKwh, totalAmount: +(st.energyKwh * st.pricePerKwh).toFixed(2),
        elapsedSeconds: st.elapsedSeconds, issuedAt: new Date().toLocaleTimeString('pt-BR'), source: 'DEMO',
      } : null });
  },
  clearInvoice: () => set({ lastInvoice: null, energyKwh: 0, batteryPercent: 20, elapsedSeconds: 0, error: null }),
  updateTelemetry: (powerKw, energyKwh) => set({ powerKw, energyKwh, batteryPercent: battery(energyKwh) }),
  reset: () => { sessionSeq++; clearTimer(); closeSocket(); set({ isCharging: false, pendingInvoice: false, wsConnected: false,
    reservationId: null, sessionId: null, lastInvoice: null, invoiceHistory: [], degradedServices: [], error: null, powerKw: 0, energyKwh: 0 }); },
}));
