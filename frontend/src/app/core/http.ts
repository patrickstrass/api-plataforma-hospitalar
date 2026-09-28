import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService); const router = inject(Router); const token = auth.token;
  const headers: Record<string, string> = { 'X-Correlation-Id': crypto.randomUUID() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return next(req.clone({ setHeaders: headers })).pipe(catchError((erro: HttpErrorResponse) => {
    if (erro.status === 401) auth.sair(); else if (erro.status === 403) void router.navigateByUrl('/acesso-negado');
    return throwError(() => erro);
  }));
};
