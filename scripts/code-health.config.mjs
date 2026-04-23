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
    'backend/src/modules/chat-context/service.ts': {
      maxLines: 636,
      reason: 'Chat context service split is deferred until the next touch.',
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
      maxLines: 941,
      reason:
        'Registration service split is deferred until the next auth change.',
    },
    'backend/src/modules/registration/repository.ts': {
      maxLines: 513,
      reason:
        'Registration repository split is deferred until the next auth change.',
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
