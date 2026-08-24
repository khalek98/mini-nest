import { Controller } from "../decorators/controller.js";
import { Injectable } from "../decorators/injectable.js";
import { Get } from "../decorators/methods.js";
import { Public } from "../decorators/public.js";

@Controller()
@Injectable()
export class HealthController {
  @Public()
  @Get("health")
  check() {
    return { status: "ok" };
  }
}
