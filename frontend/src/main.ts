import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { AppComponent } from "./app/app.component";
import { routes } from "./app/app.routes";
import { apiInterceptor } from "./app/core/http";

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient(withInterceptors([apiInterceptor]))],
}).catch(console.error);
