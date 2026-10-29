import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterCandidateDto {
  @IsString()
  @IsNotEmpty({ message: 'Candidate full name is required' })
  name: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Job position is required' })
  jobPosition: string;
}

