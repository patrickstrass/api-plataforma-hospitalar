import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Papel } from './api.types';

export const autenticado: CanActivateFn = () => inject(AuthService).token ? true : inject(Router).createUrlTree(['/login']);
export const papeis = (...permitidos: Papel[]): CanActivateFn => () => inject(AuthService).permite(...permitidos) ? true : inject(Router).createUrlTree(['/acesso-negado']);
