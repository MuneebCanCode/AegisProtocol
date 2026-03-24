import { successResponse, errorResponse } from '../response';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('successResponse', () => {
  it('returns standard success shape', () => {
    const res = mockRes();
    successResponse(res, { id: '1' }, 'Created');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: '1' },
      message: 'Created',
    });
  });

  it('accepts custom status code', () => {
    const res = mockRes();
    successResponse(res, null, 'Done', 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('includes hedera fields when provided', () => {
    const res = mockRes();
    successResponse(res, { accountId: '0.0.123' }, 'Account created', 200, {
      transactionId: '0.0.1@123',
      hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1@123',
      status: 'SUCCESS',
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        transactionId: '0.0.1@123',
        hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.1@123',
        status: 'SUCCESS',
      })
    );
  });
});

describe('errorResponse', () => {
  it('returns standard error shape', () => {
    const res = mockRes();
    errorResponse(res, 'NOT_FOUND', 'User not found', 404);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'NOT_FOUND',
      message: 'User not found',
    });
  });

  it('defaults to 500 status code', () => {
    const res = mockRes();
    errorResponse(res, 'INTERNAL', 'Something broke');
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
