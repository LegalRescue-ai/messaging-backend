import { Test, TestingModule } from '@nestjs/testing';
import { ContactsService } from './contacts.service';
import { SendbirdService } from '../sendbird/sendbird.service';
import { ConfigService } from '@nestjs/config';
import { CreateContactDto } from './dto/create-contact.dto';
import { NotFoundException } from '@nestjs/common';

describe('ContactsService', () => {
  let service: ContactsService;
  let sendbirdService: SendbirdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: SendbirdService,
          useValue: {
            findUserByEmail: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    sendbirdService = module.get<SendbirdService>(SendbirdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createContact', () => {
    it('should create a contact successfully', async () => {
      const createContactDto: CreateContactDto = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'client',
        sendbirdUserId: 'sb_123',
      };

      const contact = await service.createContact(createContactDto);

      expect(contact).toMatchObject({
        ...createContactDto,
        id: expect.any(String),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('findById', () => {
    it('should find a contact by ID', async () => {
      const createContactDto: CreateContactDto = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'client',
        sendbirdUserId: 'sb_123',
      };

      const created = await service.createContact(createContactDto);
      const found = await service.findById(created.id);

      expect(found).toEqual(created);
    });

    it('should throw NotFoundException when contact not found', async () => {
      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should find a contact by email', async () => {
      const createContactDto: CreateContactDto = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'client',
        sendbirdUserId: 'sb_123',
      };

      const created = await service.createContact(createContactDto);
      const found = await service.findByEmail(created.email);

      expect(found).toEqual(created);
    });

    it('should return null when contact not found by email', async () => {
      const found = await service.findByEmail('non-existent@example.com');
      expect(found).toBeNull();
    });
  });

  describe('findBySendbirdUserId', () => {
    it('should find a contact by Sendbird user ID', async () => {
      const createContactDto: CreateContactDto = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'client',
        sendbirdUserId: 'sb_123',
      };

      const created = await service.createContact(createContactDto);
      const found = await service.findBySendbirdUserId(created.sendbirdUserId);

      expect(found).toEqual(created);
    });

    it('should return null when contact not found by Sendbird user ID', async () => {
      const found = await service.findBySendbirdUserId('non-existent');
      expect(found).toBeNull();
    });
  });
});
