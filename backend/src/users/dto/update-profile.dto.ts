import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  school?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar?: string;
}
