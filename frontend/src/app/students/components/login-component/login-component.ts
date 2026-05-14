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

  // Force change password modal
  showForceChange = signal(false);
  forceNewPassword = signal('');
  forceConfirmPassword = signal('');
  forceShowPasswords = signal(false);
  forceLoading = signal(false);
  forceMessage = signal('');
  forceError = signal('');

  login() {
    if (!this.codigo() || !this.password()) {
      this.errorMessage.set('Ingresa codigo y contrasena');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.codigo(), this.password()).subscribe({
      next: (response) => {
        this.loading.set(false);

        if (response.student.must_change_password) {
          this.showForceChange.set(true);
        } else {
          this.router.navigate(['/details']);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo iniciar sesion');
        this.loading.set(false);
      },
    });
  }

  submitForceChange() {
    const newPw = this.forceNewPassword().trim();
    const confirmPw = this.forceConfirmPassword().trim();

    if (!newPw || !confirmPw) {
      this.forceError.set('Todos los campos son obligatorios');
      return;
    }

    if (newPw.length < 6) {
      this.forceError.set('La contrasena debe tener al menos 6 caracteres');
      return;
    }

    if (newPw !== confirmPw) {
      this.forceError.set('Las contrasenas no coinciden');
      return;
    }

    this.forceLoading.set(true);
    this.forceError.set('');
    this.forceMessage.set('');

    this.authService.changePassword(this.codigo(), newPw).subscribe({
      next: (result) => {
        this.forceMessage.set(result.message);
        this.forceLoading.set(false);

        setTimeout(() => {
          this.showForceChange.set(false);
          this.router.navigate(['/details']);
        }, 2000);
      },
      error: (err) => {
        this.forceError.set(err.error?.message || 'No se pudo cambiar la contrasena');
        this.forceLoading.set(false);
      },
    });
  }
}
