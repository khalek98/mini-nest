import { Controller } from "../decorators/controller.js";
import { Injectable } from "../decorators/injectable.js";
import { Get } from "../decorators/methods.js";

@Controller()
@Injectable()
export class HealthController {
  @Get("health")
  check() {
    return { status: "ok" };
  }
}
