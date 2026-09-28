import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({ standalone: true, imports: [RouterLink], template: `<section><h1>Acesso negado</h1><p>Seu papel não permite acessar esta página.</p><a routerLink="/">Voltar ao início</a></section>` })
export class AccessDeniedComponent {}
