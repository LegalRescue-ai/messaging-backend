import { CanActivate, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(
    context: any,
  ): boolean | any | Promise<boolean | any> | Observable<boolean | any> {
    try {
      const token = context.args[0].handshake.headers.authorization.split(' ')[1];
      const decoded = this.jwtService.verify(token);
      context.args[0].user = decoded;
      return true;
    } catch (err) {
      return false;
    }
  }
}
