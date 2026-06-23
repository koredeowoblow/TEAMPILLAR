const mClient = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setEx: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
  sRandMember: jest.fn().mockResolvedValue([]),
  sAdd: jest.fn().mockResolvedValue(1),
  isOpen: true
};

export const getRedisClient = jest.fn().mockResolvedValue(mClient);
export const initializeRedis = jest.fn().mockResolvedValue(mClient);
export const isRedisAvailable = jest.fn().mockReturnValue(true);
export const closeRedis = jest.fn().mockResolvedValue();
