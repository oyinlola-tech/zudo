/**
 * HTTP testing utilities tests.
 */

import { describe, it, expect } from "vitest";

import {
  createTestHTTPRequest,
  createTestHTTPResponse,
  jsonResponse,
  createdResponse,
  noContentResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "../src/httpTesting/index.js";

import {
  assertResponseStatus,
  assertResponseHeader,
  assertResponseBody,
  assertOK,
  assertCreated,
  assertNoContent,
  assertBadRequest,
  assertNotFound,
  assertServerError,
} from "../src/assertions/index.js";

describe("HTTPRequestBuilder", () => {
  it("should build a GET request", () => {
    const request = createTestHTTPRequest().GET("/api/users").build();

    expect(request.method).toBe("GET");
    expect(request.path).toBe("/api/users");
  });

  it("should build a POST request with body", () => {
    const request = createTestHTTPRequest()
      .POST("/api/users")
      .withBody({ name: "John" })
      .build();

    expect(request.method).toBe("POST");
    expect(request.body).toEqual({ name: "John" });
  });

  it("should add headers", () => {
    const request = createTestHTTPRequest()
      .GET("/api/users")
      .withHeader("Authorization", "Bearer token123")
      .build();

    expect(request.headers.get("authorization")).toBe("Bearer token123");
  });

  it("should add query parameters", () => {
    const request = createTestHTTPRequest()
      .GET("/api/users")
      .withQuery({ page: "1", limit: "10" })
      .build();

    expect(request.query).toEqual({ page: "1", limit: "10" });
  });

  it("should add route parameters", () => {
    const request = createTestHTTPRequest()
      .GET("/api/users/:id")
      .withParam("id", "123")
      .build();

    expect(request.params).toEqual({ id: "123" });
  });
});

describe("HTTPResponseBuilder", () => {
  it("should build a 200 JSON response", () => {
    const response = createTestHTTPResponse()
      .status(200)
      .json({ id: "123", name: "John" })
      .build();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "123", name: "John" });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.sent).toBe(true);
  });

  it("should build a text response", () => {
    const response = createTestHTTPResponse()
      .status(200)
      .text("Hello World")
      .build();

    expect(response.body).toBe("Hello World");
    expect(response.headers.get("content-type")).toBe("text/plain");
  });

  it("should build an empty response", () => {
    const response = createTestHTTPResponse().status(204).empty().build();

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
    expect(response.sent).toBe(true);
  });
});

describe("HTTP response helpers", () => {
  it("should create JSON response", () => {
    const response = jsonResponse({ id: "123" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: "123" });
  });

  it("should create created response", () => {
    const response = createdResponse({ id: "123" });

    expect(response.status).toBe(201);
  });

  it("should create no content response", () => {
    const response = noContentResponse();

    expect(response.status).toBe(204);
  });

  it("should create bad request response", () => {
    const response = badRequestResponse("Invalid input");

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Invalid input" });
  });

  it("should create not found response", () => {
    const response = notFoundResponse();

    expect(response.status).toBe(404);
  });

  it("should create server error response", () => {
    const response = serverErrorResponse();

    expect(response.status).toBe(500);
  });
});

describe("HTTP assertions", () => {
  it("should assert status code", () => {
    const response = jsonResponse({});

    assertResponseStatus(response, 200);
  });

  it("should throw on wrong status code", () => {
    const response = jsonResponse({});

    expect(() => assertResponseStatus(response, 404)).toThrow(
      "Expected status 404, got 200",
    );
  });

  it("should assert header value", () => {
    const response = jsonResponse({});

    assertResponseHeader(response, "content-type", "application/json");
  });

  it("should assert response body", () => {
    const response = jsonResponse({ id: "123" });

    assertResponseBody(response, { id: "123" });
  });

  it("should assert OK", () => {
    assertOK(jsonResponse({}));
  });

  it("should assert Created", () => {
    assertCreated(createdResponse({}));
  });

  it("should assert No Content", () => {
    assertNoContent(noContentResponse());
  });

  it("should assert Bad Request", () => {
    assertBadRequest(badRequestResponse("error"));
  });

  it("should assert Not Found", () => {
    assertNotFound(notFoundResponse());
  });

  it("should assert Server Error", () => {
    assertServerError(serverErrorResponse());
  });
});
