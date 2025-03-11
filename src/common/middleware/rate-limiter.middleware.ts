import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// More lenient limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many login attempts, please try again after 15 minutes'
});

// Stricter limiter for general endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use different rate limits based on the endpoint
    if (req.path.startsWith('/users/register') || req.path.startsWith('/auth')) {
      authLimiter(req, res, next);
    } else {
      generalLimiter(req, res, next);
    }
  }
}
