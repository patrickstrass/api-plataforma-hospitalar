import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { AuthService } from './core/auth.service';

@Component({ selector: 'app-root', standalone: true, imports: [RouterOutlet, RouterLink, AsyncPipe], template: `@if (auth.usuario$ | async; as usuario) {<div class="layout"><aside><h2>Hospital</h2><small>{{ usuario.nome }} · {{ usuario.papel }}</small><nav><a routerLink="/pacientes">Pacientes</a><a routerLink="/medicos">Médicos</a><a routerLink="/leitos">Leitos</a><a routerLink="/internacoes">Internações</a><a routerLink="/agendamentos">Agenda</a>@if (usuario.papel === 'ADMIN') {<a routerLink="/usuarios">Usuários</a>}</nav><button class="sair" (click)="auth.sair()">Sair</button></aside><main class="conteudo"><router-outlet /></main></div>} @else {<router-outlet />}` })
export class AppComponent { auth = inject(AuthService); }
