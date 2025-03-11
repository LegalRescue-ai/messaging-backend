import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { Contact } from './interfaces/contact.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('v1/contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  async create(@Body() createContactDto: CreateContactDto): Promise<Contact> {
    return this.contactsService.createContact(createContactDto);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Contact> {
    return this.contactsService.findById(id);
  }

  @Get('email/:email')
  async findByEmail(@Param('email') email: string): Promise<Contact | null> {
    return this.contactsService.findByEmail(email);
  }

  @Get('sendbird/:sendbirdUserId')
  async findBySendbirdUserId(@Param('sendbirdUserId') sendbirdUserId: string): Promise<Contact | null> {
    return this.contactsService.findBySendbirdUserId(sendbirdUserId);
  }
}
