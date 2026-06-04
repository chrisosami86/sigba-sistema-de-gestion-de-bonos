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

  // Force change password modal
  showForceChange = signal(false);
  forceCurrentPassword = signal('');
  forceNewPassword = signal('');
  forceConfirmPassword = signal('');
  forceShowPasswords = signal(false);
  forceLoading = signal(false);
  forceMessage = signal('');
  forceError = signal('');

  login() {
    if (!this.correo() || !this.password()) {
      this.errorMessage.set('Ingresa correo y contraseña');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login(this.correo(), this.password()).subscribe({
      next: (response) => {
        this.loading.set(false);

        if (response.admin.must_change_password) {
          this.forceCurrentPassword.set(this.password());
          this.password.set('');
          this.showForceChange.set(true);
        } else {
          this.router.navigate(['/admin']);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'No se pudo iniciar sesion');
        this.loading.set(false);
      },
    });
  }

  submitForceChange() {
    const currentPw = this.forceCurrentPassword().trim();
    const newPw = this.forceNewPassword().trim();
    const confirmPw = this.forceConfirmPassword().trim();

    if (!currentPw || !newPw || !confirmPw) {
      this.forceError.set('Todos los campos son obligatorios');
      return;
    }

    if (newPw.length < 6) {
      this.forceError.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPw !== confirmPw) {
      this.forceError.set('Las contraseñas no coinciden');
      return;
    }

    if (currentPw === newPw) {
      this.forceError.set('La nueva contraseña no puede ser igual a la actual');
      return;
    }

    this.forceLoading.set(true);
    this.forceError.set('');
    this.forceMessage.set('');

    this.authService.changePassword(currentPw, newPw).subscribe({
      next: (result) => {
        this.forceMessage.set(result.message);
        this.forceLoading.set(false);

        setTimeout(() => {
          this.showForceChange.set(false);
          this.router.navigate(['/admin']);
        }, 2000);
      },
      error: (err) => {
        this.forceError.set(err.error?.message || 'No se pudo cambiar la contraseña');
        this.forceLoading.set(false);
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
        this.recoveryError.set(err.error?.message || 'No se pudo recuperar la contraseña');
        this.recoveryLoading.set(false);
      },
    });
  }
}
