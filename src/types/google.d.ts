// Google Identity Services の型定義
declare namespace google {
    namespace accounts {
        namespace oauth2 {
            interface TokenClient {
                requestAccessToken(options?: { prompt?: string }): void;
            }

            interface TokenResponse {
                access_token: string;
                error?: string;
            }

            function initTokenClient(config: {
                client_id: string;
                scope: string;
                callback: (response: TokenResponse) => void;
            }): TokenClient;
        }
    }
}
