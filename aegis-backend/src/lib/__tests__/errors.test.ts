import {
  AppError,
  ValidationError,
  AuthError,
  NotFoundError,
  ConflictError,
  KmsError,
  HederaError,
} from '../errors';

describe('Error classes', () => {
  it('AppError sets message and statusCode', () => {
    const err = new AppError('boom', 503);
    expect(err.message).toBe('boom');
    expect(err.statusCode).toBe(503);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it.each([
    { Cls: ValidationError, code: 400, defaultMsg: 'Validation failed' },
    { Cls: AuthError, code: 401, defaultMsg: 'Authentication failed' },
    { Cls: NotFoundError, code: 404, defaultMsg: 'Resource not found' },
    { Cls: ConflictError, code: 409, defaultMsg: 'Resource already exists' },
    { Cls: KmsError, code: 500, defaultMsg: 'KMS operation failed' },
    { Cls: HederaError, code: 500, defaultMsg: 'Hedera operation failed' },
  ])('$Cls.name has statusCode $code and correct default message', ({ Cls, code, defaultMsg }) => {
    const err = new Cls();
    expect(err.statusCode).toBe(code);
    expect(err.message).toBe(defaultMsg);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('subclasses accept custom messages', () => {
    const err = new ValidationError('bad email');
    expect(err.message).toBe('bad email');
    expect(err.statusCode).toBe(400);
  });
});
