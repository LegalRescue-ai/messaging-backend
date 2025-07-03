import { Test, TestingModule } from '@nestjs/testing';
import { Dynamo } from './dynamo';

describe('Dynamo', () => {
  let provider: Dynamo;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Dynamo],
    }).compile();

    provider = module.get<Dynamo>(Dynamo);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
