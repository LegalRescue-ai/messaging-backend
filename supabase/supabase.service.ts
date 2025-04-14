/* eslint-disable prettier/prettier */
/* eslint-disable prefer-const */
import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

@Injectable()
export class SupabaseService {
  private supabaseUrl: string = process.env.SUPABASE_URL || '';
  private supabaseKey: string = process.env.SUPABASE_KEY || '';
  private supabase: any;


  constructor() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.log(this.supabaseUrl);
      console.log(this.supabaseKey);
      
      
      throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY is missing');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }


  getClient(): SupabaseClient {
    return this.supabase;
  }
}