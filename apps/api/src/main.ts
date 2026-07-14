import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
      credentials: true
    }
  });

  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  const openApiConfig = new DocumentBuilder()
    .setTitle("PulseOps API")
    .setDescription("DevOps Incident Command Center API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`PulseOps API listening on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
