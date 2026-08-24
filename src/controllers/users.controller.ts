import { Controller } from "../decorators/controller.js";
import { Injectable } from "../decorators/injectable.js";
import { Get, Post } from "../decorators/methods.js";
import { Body, Param, Query } from "../decorators/params.js";
import { CreateUserDto } from "../dto/create-user.dto.js";
import { UsersService } from "../services/users.service.js";

@Controller("users")
@Injectable()
export class UsersController {
  constructor(readonly users: UsersService) {}

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.users.findById(id);
  }

  @Get()
  findAll(@Query("limit") limit: string) {
    return this.users.list(limit);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    const user = this.users.create(dto);
    return {
      ...user,
      dtoClass: dto.constructor.name,
      isDto: dto instanceof CreateUserDto,
    };
  }
}
