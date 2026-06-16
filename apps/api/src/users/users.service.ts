import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Uf } from '../common/uf';
import { CompanyPorte } from './company-porte.enum';
import { User } from './user.entity';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  cnpj: string | null;
  porte: CompanyPorte | null;
  uf: Uf | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  create(input: CreateUserInput): Promise<User> {
    const user = this.users.create(input);
    return this.users.save(user);
  }
}
