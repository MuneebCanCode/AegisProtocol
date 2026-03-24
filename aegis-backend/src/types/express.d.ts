declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      email: string;
      iat: number;
      exp: number;
    };
  }
}
