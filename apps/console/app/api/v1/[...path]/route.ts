import { z } from "zod";
import { CATALOGUE } from "@blakid/integrations";
import { ForbiddenError, TenantIsolationError } from "@blakid/authz";
import { getBlakID } from "../../../../lib/blakid.ts";
import { principalFromRequest, requestContext } from "../../../../lib/principal.ts";

export const dynamic = "force-dynamic";

type Params = { path: string[] };

async function handle(request: Request, params: Params) {
  const principal = await principalFromRequest(request);
  const segments = params.path;
  const resource = segments[0] ?? "";
  const id = segments[1];
  const extra = segments[2];
  const extra2 = segments[3];
  const url = new URL(request.url);
  const orgId = url.searchParams.get("organisationId") ?? (await request.clone().json().catch(() => ({}))).organisationId;
  const ctx = requestContext(request);
  const app = getBlakID();

  if (!principal && resource !== "integrations" && !(resource === "invitations" && id === "accept")) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    if (resource === "organisations" && request.method === "GET" && !id) {
      const list = await app.listOrganisations(principal!);
      return Response.json(list);
    }
    if (resource === "organisations" && request.method === "POST" && !id) {
      const body = z
        .object({
          name: z.string().min(2),
          slug: z.string().min(2),
          customDomain: z.string().optional(),
          hostingModel: z.enum(["blakid_australian_cloud", "customer_aws", "self_hosted"]).optional(),
          existingIdp: z.string().nullable().optional(),
          adminEmail: z.string().email(),
          adminName: z.string().min(1),
        })
        .parse(await request.json());
      const result = await app.provisionOrganisation(principal!, body, ctx);
      return Response.json(result, { status: 201 });
    }
    if (resource === "organisations" && id && request.method === "GET" && !extra) {
      return Response.json(await app.getOrganisation(principal!, id));
    }
    if (resource === "organisations" && id && extra === "sovereignty") {
      return Response.json(await app.sovereignty(principal!, id));
    }
    if (resource === "organisations" && id && extra === "backup" && request.method === "POST") {
      return Response.json(await app.backup(principal!, id));
    }
    if (resource === "organisations" && id && extra === "restore-test" && request.method === "POST") {
      return Response.json(await app.restoreTest(principal!, id));
    }
    if (resource === "organisations" && id && extra === "invite-admin" && request.method === "POST") {
      const body = z
        .object({ email: z.string().email(), name: z.string(), role: z.string().optional() })
        .parse(await request.json());
      const invitation = await app.inviteOrganisationAdmin(
        principal!,
        id,
        { email: body.email, name: body.name, role: (body.role as "ORGANISATION_OWNER") ?? "ORGANISATION_OWNER" },
        ctx,
      );
      return Response.json(invitation, { status: 201 });
    }

    if (resource === "invitations" && id === "accept" && request.method === "POST") {
      const body = z.object({ token: z.string(), password: z.string().min(8) }).parse(await request.json());
      return Response.json(await app.acceptInvitation(body.token, body.password));
    }

    const organisationId = orgId ?? principal?.organisationId;
    if (!organisationId && resource !== "integrations") {
      return Response.json({ error: "organisationId required" }, { status: 400 });
    }

    if (resource === "users" && request.method === "GET" && !id) {
      return Response.json(await app.listUsers(principal!, organisationId!));
    }
    if (resource === "users" && request.method === "POST" && !id) {
      const body = z
        .object({
          email: z.string().email(),
          name: z.string(),
          kind: z.string().optional(),
          password: z.string().optional(),
        })
        .parse(await request.json());
      const user = await app.inviteUser(
        principal!,
        organisationId!,
        { email: body.email, name: body.name, kind: body.kind as "person" | undefined, password: body.password },
        ctx,
      );
      return Response.json(user, { status: 201 });
    }
    if (resource === "users" && id && extra === "suspend" && request.method === "POST") {
      return Response.json(await app.suspendUser(principal!, organisationId!, id, ctx));
    }
    if (resource === "users" && id && extra === "restore" && request.method === "POST") {
      return Response.json(await app.restoreUser(principal!, organisationId!, id, ctx));
    }
    if (resource === "users" && id && extra === "terminate" && request.method === "POST") {
      return Response.json(await app.terminateUser(principal!, organisationId!, id, ctx));
    }
    if (resource === "users" && id && extra === "sessions" && extra2 === "revoke" && request.method === "POST") {
      await app.revokeSessions(principal!, organisationId!, id, ctx);
      return Response.json({ ok: true });
    }
    if (resource === "users" && id && request.method === "GET") {
      return Response.json(await app.getUser(principal!, organisationId!, id));
    }

    if (resource === "groups" && request.method === "GET") {
      return Response.json(await app.listGroups(principal!, organisationId!));
    }
    if (resource === "groups" && request.method === "POST" && !id) {
      const body = z.object({ name: z.string() }).parse(await request.json());
      return Response.json(await app.createGroup(principal!, organisationId!, body.name, ctx), { status: 201 });
    }
    if (resource === "groups" && id && extra === "members" && request.method === "POST") {
      const body = z.object({ userId: z.string() }).parse(await request.json());
      await app.addGroupMember(principal!, organisationId!, id, body.userId, ctx);
      return Response.json({ ok: true });
    }
    if (resource === "groups" && id && extra === "members" && extra2 && request.method === "DELETE") {
      await app.removeGroupMember(principal!, organisationId!, id, extra2, ctx);
      return Response.json({ ok: true });
    }

    if (resource === "applications" && request.method === "GET" && !id) {
      return Response.json(await app.listApplications(principal!, organisationId!));
    }
    if (resource === "applications" && request.method === "POST") {
      const body = z
        .object({
          protocol: z.enum(["oidc", "saml", "ldap"]).optional(),
          catalogueId: z.string().optional(),
          name: z.string(),
          slug: z.string(),
          redirectUris: z.array(z.string()).optional(),
          logoutUri: z.string().optional(),
          acsUrl: z.string().optional(),
          audience: z.string().optional(),
          metadataXml: z.string().optional(),
          scimUrl: z.string().optional(),
          scimToken: z.string().optional(),
        })
        .parse(await request.json());
      if (body.catalogueId) {
        return Response.json(
          await app.applyCatalogue(
            principal!,
            organisationId!,
            {
              catalogueId: body.catalogueId,
              protocol: body.protocol === "saml" ? "saml" : body.protocol === "ldap" ? "ldap" : "oidc",
              name: body.name,
              slug: body.slug,
              redirectUris: body.redirectUris,
              logoutUri: body.logoutUri,
              acsUrl: body.acsUrl,
              audience: body.audience,
              scimUrl: body.scimUrl,
              scimToken: body.scimToken,
            },
            ctx,
          ),
          { status: 201 },
        );
      }
      if (body.protocol === "saml") {
        if (!body.acsUrl) return Response.json({ error: "acsUrl required" }, { status: 400 });
        return Response.json(
          await app.createSamlApplication(
            principal!,
            organisationId!,
            { name: body.name, slug: body.slug, acsUrl: body.acsUrl, audience: body.audience, metadataXml: body.metadataXml },
            ctx,
          ),
          { status: 201 },
        );
      }
      if (body.protocol === "ldap") {
        return Response.json({ error: "LDAP is a legacy integration. Prefer OpenID Connect or SAML." }, { status: 400 });
      }
      return Response.json(
        await app.createOidcApplication(
          principal!,
          organisationId!,
          {
            name: body.name,
            slug: body.slug,
            redirectUris: body.redirectUris ?? [],
            logoutUri: body.logoutUri,
          },
          ctx,
        ),
        { status: 201 },
      );
    }
    if (resource === "applications" && id && extra === "discovery" && request.method === "GET") {
      const application = await app.getApplication(principal!, organisationId!, id);
      const discovery = await app.runtime.clientFor(organisationId!).getOidcDiscovery(application.slug);
      return Response.json(discovery);
    }
    if (resource === "applications" && id && extra === "jwks" && request.method === "GET") {
      const application = await app.getApplication(principal!, organisationId!, id);
      const jwks = await app.runtime.clientFor(organisationId!).getJwks(application.slug);
      return Response.json(jwks);
    }
    if (resource === "applications" && id && request.method === "GET") {
      return Response.json(await app.getApplication(principal!, organisationId!, id));
    }

    if (resource === "roles" && request.method === "GET") {
      return Response.json(await app.listRoles(principal!, organisationId!));
    }

    if (resource === "access-requests" && request.method === "GET") {
      return Response.json(await app.listAccessRequests(principal!, organisationId!));
    }
    if (resource === "access-requests" && request.method === "POST" && !id) {
      const body = z
        .object({
          applicationId: z.string(),
          requestedRole: z.string(),
          justification: z.string(),
          expiresAt: z.string().nullable().optional(),
        })
        .parse(await request.json());
      return Response.json(await app.createAccessRequest(principal!, organisationId!, body), { status: 201 });
    }
    if (resource === "access-requests" && id && extra === "decide" && request.method === "POST") {
      const body = z.object({ decision: z.enum(["approved", "denied"]) }).parse(await request.json());
      return Response.json(await app.decideAccessRequest(principal!, organisationId!, id, body.decision));
    }

    if (resource === "service-accounts" && request.method === "GET") {
      return Response.json(await app.listServiceAccounts(principal!, organisationId!));
    }
    if (resource === "service-accounts" && request.method === "POST") {
      const body = z
        .object({
          kind: z.enum(["service_account", "machine", "api_client", "workload", "automation_agent", "ai_agent"]),
          email: z.string().email(),
          name: z.string(),
          ownerId: z.string(),
          purpose: z.string(),
          expiresAt: z.string().nullable().optional(),
          permittedApplications: z.array(z.string()).optional(),
          modelProvider: z.string().nullable().optional(),
        })
        .parse(await request.json());
      return Response.json(await app.createServiceIdentity(principal!, organisationId!, body, ctx), { status: 201 });
    }

    if (resource === "federation" && !id && request.method === "GET") {
      return Response.json(await app.listFederationSources(principal!, organisationId!));
    }
    if (resource === "federation" && request.method === "POST" && !id) {
      const body = z
        .object({
          name: z.string(),
          slug: z.string(),
          type: z.enum(["entra", "google", "oidc", "saml"]),
          clientId: z.string().optional(),
          clientSecret: z.string().optional(),
          wellKnownUrl: z.string().optional(),
          ssoUrl: z.string().optional(),
          entityId: z.string().optional(),
          metadataXml: z.string().optional(),
        })
        .parse(await request.json());
      return Response.json(await app.createFederationSource(principal!, organisationId!, body, ctx), { status: 201 });
    }
    if (resource === "federation" && id === "trusts" && request.method === "GET") {
      return Response.json(await app.listTrusts(principal!, organisationId!));
    }
    if (resource === "federation" && id === "trusts" && request.method === "POST") {
      const body = z
        .object({
          peerOrganisationId: z.string(),
          peerName: z.string(),
          acceptAttributes: z.array(z.string()),
          rejectAttributes: z.array(z.string()),
        })
        .parse(await request.json());
      return Response.json(await app.createTrust(principal!, organisationId!, body, ctx), { status: 201 });
    }
    if (resource === "federation" && id === "evaluate" && request.method === "POST") {
      const body = z
        .object({
          peerOrganisationId: z.string(),
          assertions: z.array(
            z.object({
              attribute: z.string(),
              value: z.unknown(),
              issuer: z.string(),
              issued_at: z.string(),
              expires_at: z.string().nullable(),
              assurance: z.enum(["organisation_verified", "self_asserted", "federated"]),
            }),
          ),
        })
        .parse(await request.json());
      return Response.json(
        await app.evaluateFederatedAssertions(principal!, organisationId!, body.peerOrganisationId, body.assertions),
      );
    }

    if (resource === "security" && (id === "dashboard" || id === "findings") && request.method === "GET") {
      return Response.json(await app.securityDashboard(principal!, organisationId!));
    }

    if (resource === "webhooks" && request.method === "GET" && extra === "deliveries") {
      return Response.json(await app.listWebhookDeliveries(principal!, organisationId!));
    }
    if (resource === "webhooks" && request.method === "GET") {
      return Response.json(await app.listWebhooks(principal!, organisationId!));
    }
    if (resource === "webhooks" && request.method === "POST") {
      const body = z
        .object({ url: z.string(), secret: z.string(), events: z.array(z.string()) })
        .parse(await request.json());
      return Response.json(
        await app.createWebhook(principal!, organisationId!, {
          url: body.url,
          secret: body.secret,
          events: body.events as never,
        }),
        { status: 201 },
      );
    }

    if (resource === "administrators" && request.method === "GET") {
      return Response.json(await app.listAdministrators(principal!, organisationId!));
    }
    if (resource === "administrators" && id && request.method === "POST") {
      const body = z.object({ role: z.string() }).parse(await request.json());
      return Response.json(await app.assignAdministrator(principal!, organisationId!, id, body.role as never, ctx));
    }

    if (resource === "scim" && extra === "token" && request.method === "POST") {
      return Response.json(await app.createInboundScimToken(principal!, organisationId!), { status: 201 });
    }

    if (resource === "mcp" && request.method === "POST") {
      const body = z.object({ tool: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).parse(await request.json());
      return Response.json(await app.invokeMcp(principal!, organisationId!, body.tool, body.arguments ?? {}));
    }
    if (resource === "agent-actions" && request.method === "GET") {
      return Response.json(await app.store.listAgentActions(organisationId!));
    }
    if (resource === "agent-actions" && id && extra === "decide" && request.method === "POST") {
      const body = z.object({ decision: z.enum(["approved", "denied"]) }).parse(await request.json());
      return Response.json(await app.decideAgentAction(principal!, organisationId!, id, body.decision));
    }
    if (resource === "agent-actions" && id && extra === "execute" && request.method === "POST") {
      return Response.json(await app.executeAgentAction(principal!, organisationId!, id));
    }

    if (resource === "events" && request.method === "GET") {
      const format = url.searchParams.get("format");
      if (format === "csv") {
        const csv = await app.exportEvents(principal!, organisationId!, "csv");
        return new Response(csv, { headers: { "Content-Type": "text/csv" } });
      }
      return Response.json(await app.listEvents(principal!, organisationId!));
    }

    if (resource === "integrations" && request.method === "GET") {
      return Response.json(CATALOGUE);
    }

    if (resource === "authentication" && extra === undefined && id === "passkeys" && request.method === "GET") {
      return Response.json(await app.passkeyEnrolment(principal!, organisationId!));
    }

    if (resource === "support-access" && request.method === "POST" && !id) {
      const body = z
        .object({
          organisationId: z.string(),
          reason: z.string(),
          scopes: z.array(z.string()),
          breakGlass: z.boolean().optional(),
        })
        .parse(await request.json());
      return Response.json(
        await app.requestSupportAccess(
          principal!,
          body.organisationId,
          { reason: body.reason, scopes: body.scopes as never, breakGlass: body.breakGlass },
          ctx,
        ),
        { status: 201 },
      );
    }
    if (resource === "support-access" && id && extra === "approve" && request.method === "POST") {
      return Response.json(await app.approveSupportAccess(principal!, id, ctx));
    }
    if (resource === "support-access" && id && extra === "deny" && request.method === "POST") {
      return Response.json(await app.denySupportAccess(principal!, id, ctx));
    }
    if (resource === "support-access" && id && extra === "start" && request.method === "POST") {
      return Response.json(await app.startSupportAccess(principal!, id, ctx));
    }
    if (resource === "support-access" && id && extra === "end" && request.method === "POST") {
      return Response.json(await app.endSupportAccess(principal!, id, ctx));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof TenantIsolationError || error instanceof ForbiddenError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "error";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request, context: { params: Promise<Params> }) {
  return handle(request, await context.params);
}
export async function POST(request: Request, context: { params: Promise<Params> }) {
  return handle(request, await context.params);
}
export async function DELETE(request: Request, context: { params: Promise<Params> }) {
  return handle(request, await context.params);
}
