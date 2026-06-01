import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  showSplash = signal(true);

  private readonly MIN_SPLASH_MS = 5000;
  private readonly HEALTH_URL = `${environment.API_URL}/api/system/health`;

  ngOnInit() {
    const minSplashTimer = new Promise<void>(resolve => setTimeout(resolve, this.MIN_SPLASH_MS));

    const warmUp = fetch(this.HEALTH_URL)
      .catch(() => null);

    Promise.race([warmUp, minSplashTimer])
      .catch(() => null)
      .finally(() => this.showSplash.set(false));
  }
}
