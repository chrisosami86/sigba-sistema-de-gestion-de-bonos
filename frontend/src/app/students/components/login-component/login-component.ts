import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Modal } from '../modal/modal';
import { StudentAuthService } from '../../services/student-auth.service';

@Component({
  selector: 'login-component',
  imports: [Modal],
  templateUrl: './login-component.html',
})
export class LoginComponent {
  private authService = inject(StudentAuthService);
  private router = inject(Router);

  codigo = signal('');
  password = signal('');
  showPassword = signal(false);
  loading = signal(false);
  errorMessage = signal('');

  login() {
    if (!this.codigo() || !this.password()) {
      this.errorMessage.set('Ingresa codigo y contrasena');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.codigo(), this.password()).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/details']);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo iniciar sesion');
        this.loading.set(false);
      },
    });
  }
}
