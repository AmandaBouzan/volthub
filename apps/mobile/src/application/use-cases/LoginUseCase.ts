import { Result } from '@/core/types/Result';
import { User } from '@/domain/entities/User';
import { IAuthRepository, LoginCredentials } from '@/domain/repositories/IAuthRepository';

export class LoginUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(credentials?: LoginCredentials): Promise<Result<User>> {
    // Falhas de rede/CORS são erros. Demonstração é uma escolha explícita na tela.
    return this.authRepository.login(credentials);
  }
}
