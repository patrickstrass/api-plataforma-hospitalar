import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, Papel, UsuarioToken } from './api.types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient); private router = inject(Router);
  private usuarioSubject = new BehaviorSubject<UsuarioToken | null>(this.lerUsuario());
  usuario$ = this.usuarioSubject.asObservable();
  get token(): string | null { return localStorage.getItem('accessToken'); }
  get usuario(): UsuarioToken | null { return this.usuarioSubject.value; }
  login(email: string, senha: string) { return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, senha }).pipe(tap(r => { localStorage.setItem('accessToken', r.accessToken); localStorage.setItem('usuario', JSON.stringify(r.usuario)); this.usuarioSubject.next(r.usuario); })); }
  sair() { localStorage.removeItem('accessToken'); localStorage.removeItem('usuario'); this.usuarioSubject.next(null); void this.router.navigateByUrl('/login'); }
  permite(...papeis: Papel[]) { return !!this.usuario && papeis.includes(this.usuario.papel); }
  private lerUsuario(): UsuarioToken | null { try { const valor = localStorage.getItem('usuario'); return valor ? JSON.parse(valor) : null; } catch { return null; } }
}
