import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({ standalone: true, imports: [FormsModule], template: `<main class="login"><form (ngSubmit)="entrar()"><h1>Gestão Hospitalar</h1><label>E-mail<input type="email" name="email" [(ngModel)]="email" required></label><label>Senha<input type="password" name="senha" [(ngModel)]="senha" minlength="8" required></label>@if (erro) {<p class="erro">{{ erro }}</p>}<button [disabled]="carregando">{{ carregando ? 'Entrando…' : 'Entrar' }}</button></form></main>` })
export class LoginComponent {
  private auth = inject(AuthService); private router = inject(Router);
  email = ''; senha = ''; erro = ''; carregando = false;
  entrar() { this.carregando = true; this.erro = ''; this.auth.login(this.email, this.senha).subscribe({ next: () => void this.router.navigateByUrl('/'), error: e => { this.erro = e.error?.erro?.mensagem || 'Não foi possível entrar.'; this.carregando = false; } }); }
}
