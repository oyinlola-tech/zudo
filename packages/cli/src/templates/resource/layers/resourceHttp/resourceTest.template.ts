/**
 * zudojs-cli — A resource's HTTP test.
 */

import { withArticle, type ResourceNames } from "../../resource.names.js";

/**
 * `tests/<slug>.test.ts` (or `tests/modules/<module>/<slug>.test.ts` for a
 * module resource): drives the routes over real HTTP with
 * `createHttpTestClient`, backed by the in-memory repository.
 * `baseFromTests` is the import prefix from the test's folder to the layers.
 */
export function renderResourceTest(n: ResourceNames, baseFromTests: string): string {
  const b = baseFromTests;
  return `import { afterAll, describe, expect, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ${n.pascal}Controller } from "${b}/controllers/${n.slug}.controller.js";
import type { ${n.entity}Page } from "${b}/dtos/${n.slug}.dto.js";
import { InMemory${n.pascal}Repository } from "${b}/repositories/${n.slug}.repository.js";
import { register${n.pascal}Routes } from "${b}/routes/${n.slug}.routes.js";
import { ${n.pascal}Service } from "${b}/services/${n.slug}.service.js";

const router = createRouter();
register${n.pascal}Routes(
  router,
  new ${n.pascal}Controller(new ${n.pascal}Service(new InMemory${n.pascal}Repository())),
);
const client = createHttpTestClient(router);
afterAll(() => client.close());

describe("${n.routePath}", () => {
  it("creates, reads, updates and deletes ${withArticle(n.label)}", async () => {
    const created = await client
      .post("${n.routePath}")
      .send({ name: "Ada" })
      .expect(201)
      .expectJson({ name: "Ada" });
    const { id } = created.json<{ id: string }>();

    await client.get(\`${n.routePath}/\${id}\`).expect(200).expectJson({ id, name: "Ada" });
    await client
      .patch(\`${n.routePath}/\${id}\`)
      .send({ name: "Grace" })
      .expect(200)
      .expectJson({ name: "Grace" });
    await client.delete(\`${n.routePath}/\${id}\`).expect(204);
    await client.get(\`${n.routePath}/\${id}\`).expect(404);
  });

  it("lists ${n.label} records a page at a time", async () => {
    const ids: string[] = [];
    for (const name of ["Ada", "Grace", "Linus"]) {
      const created = await client.post("${n.routePath}").send({ name }).expect(201);
      ids.push(created.json<{ id: string }>().id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor === null ? "?limit=2" : \`?limit=2&cursor=\${cursor}\`;
      const page: ${n.entity}Page = (await client.get(\`${n.routePath}\${query}\`).expect(200)).json<${n.entity}Page>();
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual(expect.arrayContaining(ids));

    await client.get("${n.routePath}?limit=0").expect(400);
  });

  it("rejects an invalid body with 400", async () => {
    await client
      .post("${n.routePath}")
      .send({ name: "" })
      .expect(400)
      .expectJson({ error: "Validation failed" });
  });

  it("rejects an id that is not a UUID with 400", async () => {
    await client.get("${n.routePath}/not-a-uuid").expect(400);
  });
});
`;
}
