import { Controller, Get, Post, Res } from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { OpenApiDocumentHolder } from "../common/swagger/openapi-document.holder";

/**
 * Exports the validated OpenAPI JSON specification used by CI to detect spec
 * divergence. Returns a copy of the document produced during bootstrap.
 *
 * Also serves the public troubleshooting guide (keyed by stable API error
 * codes) and the field-level privacy and retention reference. Both documents
 * are read-only and intentionally exclude internal-only error details and
 * sensitive remediation steps.
 */
@ApiTags("docs")
@ApiExcludeController()
@Controller("docs")
export class DocsController {
  @Post("json")
  exportSpec(@Res() res: Response) {
    const document = OpenApiDocumentHolder.get().get();
    if (!document) {
      return res.status(503).json({
        code: "SPEC_NOT_READY",
        message: "OpenAPI document has not been generated yet.",
      });
    }
    return res.status(200).json(document);
  }

  /**
   * Returns the public troubleshooting guide keyed by stable API error codes.
   * Only public stable codes are included; internal-only details and sensitive
   * remediation are excluded.
   */
  @Get("troubleshooting")
  getTroubleshootingGuide(@Res() res: Response) {
    return this.sendMarkdown(res, TROUBLESHOOTING_GUIDE);
  }

  /**
   * Returns the field-level privacy and retention reference. Unknown fields
   * are flagged for review rather than assumed absent.
   */
  @Get("privacy-field-inventory")
  getPrivacyFieldInventory(@Res() res: Response) {
    return this.sendMarkdown(res, PRIVACY_FIELD_INVENTORY);
  }

  private sendMarkdown(res: Response, body: string) {
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(body);
  }
}

const TROUBLESHOOTING_GUIDE = `# Troubleshooting Guide

This guide maps public stable API error codes to likely causes, safe user
action, and the operator escalation path. Codes are sourced from the canonical
error registry; internal-only details and sensitive remediation are excluded.

## How to use this guide

1. Locate the \`code\` field in the API error response.
2. Read the matching entry below.
3. Follow the safe user action. If the issue persists, escalate using the
   operator escalation path.

## Error codes

### VALIDATION_FAILED
- Likely cause: The request payload failed schema validation.
- Safe user action: Correct the request fields and retry.
- Operator escalation: Contact support with the request ID if the payload
  appears valid.

### UNAUTHORIZED
- Likely cause: Missing or invalid authentication credentials.
- Safe user action: Re-authenticate and retry.
- Operator escalation: Contact support if credentials are believed correct.

### FORBIDDEN
- Likely cause: The authenticated principal lacks the required permission.
- Safe user action: Request access from your account administrator.
- Operator escalation: Contact support to review role assignments.

### NOT_FOUND
- Likely cause: The requested resource does not exist or is not visible to
  the caller.
- Safe user action: Verify the resource identifier and retry.
- Operator escalation: Contact support if the resource is expected to exist.

### CONFLICT
- Likely cause: The request conflicts with the current state of the resource.
- Safe user action: Refresh the resource and retry.
- Operator escalation: Contact support if the conflict persists.

### RATE_LIMITED
- Likely cause: Too many requests in a short period.
- Safe user action: Back off and retry after the indicated interval.
- Operator escalation: Contact support to discuss quota increases.

### SPEC_NOT_READY
- Likely cause: The OpenAPI document has not been generated yet.
- Safe user action: Retry after bootstrap completes.
- Operator escalation: Contact support if the condition persists.

### INTERNAL_ERROR
- Likely cause: An unexpected server-side failure.
- Safe user action: Retry the request; if it persists, contact support.
- Operator escalation: Contact support with the request ID and timestamp.

> Note: Codes not listed here are not part of the public stable contract.
> Do not rely on internal-only codes for integration logic.
`;

const PRIVACY_FIELD_INVENTORY = `# Privacy and Retention Field Inventory

This reference lists the profile, payment, and telemetry fields that are
stored or logged, together with their purpose, retention policy, and deletion
behavior. Fields that cannot be mapped to a known category are flagged for
review rather than assumed absent.

## Profile fields

| Field | Purpose | Retention | Deletion behavior |
| --- | --- | --- | --- |
| profile.displayName | Personalization | Until account deletion | Removed on account deletion |
| profile.email | Account identification and contact | Until account deletion | Removed on account deletion |
| profile.locale | Localization | Until account deletion | Removed on account deletion |

## Payment fields

| Field | Purpose | Retention | Deletion behavior |
| --- | --- | --- | --- |
| payment.customerId | Payment provider linkage | Until account deletion | Removed on account deletion |
| payment.last4 | Display of payment method | Until method removal | Removed on method removal |

> Full payment instrument data is never stored by this service.

## Telemetry fields

| Field | Purpose | Retention | Deletion behavior |
| --- | --- | --- | --- |
| telemetry.requestId | Request correlation | 30 days | Expires automatically |
| telemetry.latencyMs | Performance monitoring | 30 days | Expires automatically |
| telemetry.statusCode | Reliability monitoring | 30 days | Expires automatically |

## Fields flagged for review

The following fields were observed in storage or logs but are not yet mapped to
a documented category. They are flagged for review rather than assumed absent:

- (none currently flagged)

## Logging notes

- Secrets, signing material, and unnecessary personal data are not logged.
- Log retention follows the telemetry retention policy above.
`;