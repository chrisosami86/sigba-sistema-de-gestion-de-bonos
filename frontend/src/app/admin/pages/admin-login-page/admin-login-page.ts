import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FooterComponent } from '../../../shared/components/footer/footer.component';
import { LogoSIGBA } from '../../../shared/components/logoSIGBA/logoSIGBA';
import { AdminAuthService } from '../../services/admin-auth.service';

@Component({
  selector: 'admin-login-page',
  imports: [FooterComponent, LogoSIGBA],
  templateUrl: './admin-login-page.html',
})
export class AdminLoginPage {
  private authService = inject(AdminAuthService);
  private router = inject(Router);

  correo = signal('');
  password = signal('');
  recoveryCorreo = signal('');
  showPassword = signal(false);
  loading = signal(false);
  recoveryLoading = signal(false);
  errorMessage = signal('');
  recoveryMessage = signal('');
  recoveryError = signal('');

  login() {
    if (!this.correo() || !this.password()) {
      this.errorMessage.set('Ingresa correo y contrasena');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.correo(), this.password()).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/admin']);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo iniciar sesion');
        this.loading.set(false);
      },
    });
  }

  recoverPassword() {
    const correo = this.recoveryCorreo() || this.correo();

    if (!correo) {
      this.recoveryError.set('Ingresa el correo del administrador');
      return;
    }

    this.recoveryLoading.set(true);
    this.recoveryMessage.set('');
    this.recoveryError.set('');

    this.authService.recoverPassword(correo).subscribe({
      next: (response) => {
        this.recoveryMessage.set(response.message);
        this.recoveryLoading.set(false);
      },
      error: (err) => {
        this.recoveryError.set(err.error?.message || 'No se pudo recuperar la contrasena');
        this.recoveryLoading.set(false);
      },
    });
  }
}
