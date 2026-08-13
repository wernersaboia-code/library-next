export class AuthError extends Error {
  constructor(message = 'Não autenticado') {
    super(message);
    this.name = 'AuthError';
  }
}
