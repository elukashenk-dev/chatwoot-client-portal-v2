export const codeHealthConfig = {
  limits: {
    production: 500,
    test: 1000,
  },
  roots: ['frontend/src', 'backend/src', 'tests'],
  allowlist: {
    'backend/src/integrations/chatwoot/client.ts': {
      maxLines: 1654,
      reason:
        'Chatwoot resource split is deferred to a dedicated backend slice.',
    },
    'backend/src/app.test.ts': {
      maxLines: 1021,
      reason:
        'App integration test split by route area is deferred to a dedicated test-structure slice.',
    },
    'backend/src/db/schema.ts': {
      maxLines: 551,
      reason:
        'Drizzle schema split by domain is deferred to a dedicated database-structure slice.',
    },
    'backend/src/modules/chat-messages/service.ts': {
      maxLines: 1164,
      reason:
        'Chat send/read service split is deferred to a dedicated backend slice.',
    },
    'backend/src/modules/password-reset/service.ts': {
      maxLines: 747,
      reason:
        'Password reset service split is deferred until the next auth change.',
    },
    'backend/src/modules/registration/service.ts': {
      maxLines: 990,
      reason:
        'Registration service split after legal consent persistence is deferred to a dedicated auth refactor slice.',
    },
    'backend/src/modules/registration/repository.ts': {
      maxLines: 606,
      reason:
        'Registration repository split after legal consent persistence is deferred to a dedicated auth refactor slice.',
    },
    'backend/src/modules/registration/service.test.ts': {
      maxLines: 1093,
      reason:
        'Registration service test split after legal consent coverage is deferred to a dedicated test-structure slice.',
    },
    'frontend/src/features/admin-branding/components/AdminBrandingForm.tsx': {
      maxLines: 559,
      reason:
        'Admin branding form split is deferred to a dedicated admin UI structure slice.',
    },
    'frontend/src/features/auth/pages/RequestPages.test.tsx': {
      maxLines: 1028,
      reason:
        'Auth request-page test split after registration consent coverage is deferred to a dedicated test-structure slice.',
    },
    'frontend/src/features/chat/pages/ChatPage.test.tsx': {
      maxLines: 1074,
      reason:
        'Chat page test split by scenario is deferred to a dedicated test slice.',
    },
    'frontend/src/features/chat/pages/ChatPage.tsx': {
      maxLines: 527,
      reason:
        'Chat page shell split is deferred until the next route-level feature.',
    },
  },
}
