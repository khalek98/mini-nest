import { Injectable } from "../decorators/injectable.js";
import { CreateUserDto } from "../dto/create-user.dto.js";
import { getRequestId } from "../context/request-context.js";

type User = { id: string; name: string; email: string };

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();
  private seq = 1;

  findById(id: string) {
    return this.readUser(id);
  }

  private async readUser(id: string) {
    await new Promise((r) => setTimeout(r, 30));
    const requestId = getRequestId();
    const user = this.users.get(id) ?? { id };
    return { ...user, requestId };
  }

  list(limit?: string) {
    const all = [...this.users.values()];
    const n = limit !== undefined ? Number(limit) : all.length;
    const take = Number.isFinite(n) && n >= 0 ? n : all.length;

    return { limit: limit ?? null, users: all.slice(0, take) };
  }

  create(dto: CreateUserDto) {
    const id = String(this.seq++);
    const user = { id, name: dto.name, email: dto.email };
    this.users.set(id, user);
    return user;
  }
}
