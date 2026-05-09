import { Component, inject, signal } from '@angular/core';
import { StudentAuthService } from '../../services/student-auth.service';

@Component({
  selector: 'modal',
  imports: [],
  templateUrl: './modal.html',
})
export class Modal {
  private authService = inject(StudentAuthService);

  correo = signal('');
  loading = signal(false);
  message = signal('');
  errorMessage = signal('');

  recoverPassword() {
    if (!this.correo()) {
      this.errorMessage.set('Ingresa el correo registrado');
      return;
    }

    this.loading.set(true);
    this.message.set('');
    this.errorMessage.set('');

    this.authService.recoverPassword(this.correo()).subscribe({
      next: (response) => {
        this.message.set(response.message);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo recuperar la contrasena');
        this.loading.set(false);
      },
    });
  }
}
