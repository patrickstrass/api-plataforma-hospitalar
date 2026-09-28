import { Routes } from '@angular/router';
import { autenticado, papeis } from './core/guards';
import { LoginComponent } from './features/login.component';
import { ResourceComponent } from './features/resource.component';
import { AccessDeniedComponent } from './features/access-denied.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'acesso-negado', component: AccessDeniedComponent },
  { path: 'pacientes', component: ResourceComponent, canActivate: [autenticado], data: { recurso: 'pacientes', titulo: 'Pacientes' } },
  { path: 'medicos', component: ResourceComponent, canActivate: [autenticado], data: { recurso: 'medicos', titulo: 'Médicos' } },
  { path: 'leitos', component: ResourceComponent, canActivate: [autenticado], data: { recurso: 'leitos', titulo: 'Leitos' } },
  { path: 'internacoes', component: ResourceComponent, canActivate: [autenticado], data: { recurso: 'internacoes', titulo: 'Internações' } },
  { path: 'agendamentos', component: ResourceComponent, canActivate: [autenticado], data: { recurso: 'agendamentos', titulo: 'Agenda' } },
  { path: 'usuarios', component: ResourceComponent, canActivate: [autenticado, papeis('ADMIN')], data: { recurso: 'usuarios', titulo: 'Usuários' } },
  { path: '', pathMatch: 'full', redirectTo: 'pacientes' }, { path: '**', redirectTo: '' }
];
