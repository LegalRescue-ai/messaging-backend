import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Contact } from './interfaces/contact.interface';
import { CreateContactDto } from './dto/create-contact.dto';
import { SendbirdService } from '../sendbird/sendbird.service';

@Injectable()
export class ContactsService {
  private contacts: Map<string, Contact> = new Map();
  private readonly logger = new Logger(ContactsService.name);

  constructor(private readonly sendbirdService: SendbirdService) {}

  async createContact(createContactDto: CreateContactDto): Promise<Contact> {
    const contact: Contact = {
      id: this.generateId(),
      ...createContactDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.contacts.set(contact.id, contact);
    return contact;
  }

  async findById(id: string): Promise<Contact> {
    const contact = this.contacts.get(id);
    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }
    return contact;
  }

  async findByEmail(email: string): Promise<Contact | null> {
    for (const contact of this.contacts.values()) {
      if (contact.email === email) {
        return contact;
      }
    }
    return null;
  }

  async findBySendbirdUserId(sendbirdUserId: string): Promise<Contact | null> {
    for (const contact of this.contacts.values()) {
      if (contact.sendbirdUserId === sendbirdUserId) {
        return contact;
      }
    }
    return null;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}
