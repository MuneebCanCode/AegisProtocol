import { Response } from 'express';

export interface SuccessResponseData<T = unknown> {
  success: true;
  data: T;
  message: string;
  transactionId?: string;
  hashscanUrl?: string;
  status?: string;
}

export interface ErrorResponseData {
  success: false;
  error: string;
  message: string;
}

export function successResponse<T>(
  res: Response,
  data: T,
  message: string,
  statusCode = 200,
  hedera?: { transactionId: string; hashscanUrl: string; status: string }
): Response {
  const body: SuccessResponseData<T> = {
    success: true,
    data,
    message,
    ...(hedera && {
      transactionId: hedera.transactionId,
      hashscanUrl: hedera.hashscanUrl,
      status: hedera.status,
    }),
  };
  return res.status(statusCode).json(body);
}

export function errorResponse(
  res: Response,
  error: string,
  message: string,
  statusCode = 500
): Response {
  const body: ErrorResponseData = {
    success: false,
    error,
    message,
  };
  return res.status(statusCode).json(body);
}
