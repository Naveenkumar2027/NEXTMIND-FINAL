<?php
namespace OCA\MyNextcloudApp\Controller;

use OCA\MyNextcloudApp\Service\ChatService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\AppFramework\Http; 
use OCP\IConfig;

class ChatController extends Controller {
    public function __construct(
        string $AppName,
        IRequest $request,
        private ChatService $chatService,
        private IUserSession $userSession,
    ) {
        parent::__construct($AppName, $request);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function list(string $room): DataResponse {
        $since = $this->request->getParam('since');
        $sinceTs = is_numeric($since) ? (int)$since : null;
        $data = $this->chatService->listMessages($room, $sinceTs);
        return new DataResponse(['ok' => true, 'messages' => $data]);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function send(string $room): DataResponse {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'guest';
        $text = (string)$this->request->getParam('text', '');
        $message = $this->chatService->sendMessage($room, $uid, $text);
        return new DataResponse(['ok' => true, 'message' => $message]);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function react(string $room): DataResponse {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'guest';
        $messageId = (string)$this->request->getParam('messageId', '');
        $emoji = (string)$this->request->getParam('emoji', '');
        $updated = $this->chatService->addReaction($room, $messageId, $uid, $emoji);
        return new DataResponse(['ok' => true, 'message' => $updated]);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function presenceSet(string $room): DataResponse {
        $user = $this->userSession->getUser();
        $uid = $user ? $user->getUID() : 'guest';
        $status = (string)$this->request->getParam('status', 'online');
        $info = $this->chatService->setPresence($room, $uid, $status);
        return new DataResponse(['ok' => true, 'presence' => $info]);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function presenceList(string $room): DataResponse {
        $list = $this->chatService->listPresence($room);
        return new DataResponse(['ok' => true, 'presence' => $list]);
    }

    /**
     * Simple health check for route registration
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function ping(): DataResponse {
        return new DataResponse(['ok' => true, 'pong' => time()]);
    }

    /**
     * Proxy to Google Gemini API so the API key is never exposed to the browser.
     * @NoAdminRequired
     * @NoCSRFRequired
     * @PublicPage
     */
    public function gemini(): DataResponse {
        // Prefer IRequest param parsing (works for form + many JSON setups),
        // then fall back to raw JSON body as a last resort.
        $prompt = (string)$this->request->getParam('q', $this->request->getParam('prompt', ''));
        if ($prompt === '') {
            $contentType = (string)$this->request->getHeader('Content-Type');
            if (stripos($contentType, 'application/json') !== false) {
                $raw = file_get_contents('php://input') ?: '';
                $decoded = json_decode($raw, true) ?: [];
                $prompt = (string)($decoded['q'] ?? $decoded['prompt'] ?? '');
            }
        }

        $apiKey = getenv('GEMINI_API_KEY') ?: '';
        if ($apiKey === '') {
            return new DataResponse([
                'ok' => false,
                'error' => 'GEMINI_API_KEY is not set. Add it to next_cloud/.env and restart docker compose.',
            ], Http::STATUS_PRECONDITION_FAILED);
        }

        $model = (string)$this->request->getParam('model', 'gemini-2.5-flash');
        $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent?key=' . rawurlencode($apiKey);

        // If no prompt, short-circuit
        if ($prompt === '') {
            return new DataResponse(['ok' => true, 'data' => ['text' => 'Ask me anything about Nextcloud.']]);
        }

        $instruction =
            "You are a friendly Nextcloud and Nextcloud Talk (Spreed) helper.\n"
            . "Rules:\n"
            . "- Write like a helpful human colleague, not a robot.\n"
            . "- Answer in at most 60 words. Use the full limit when needed so the answer feels complete.\n"
            . "- Use complete sentences only—never stop mid-sentence.\n"
            . "- Only discuss Nextcloud or Nextcloud Talk.\n"
            . "- If the question is off-topic, reply exactly: I can only help with Nextcloud and Talk.";

        $payload = [
            'contents' => [
                [
                    'parts' => [ ['text' => $instruction . "\n\nUser question: " . $prompt] ]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.45,
                'maxOutputTokens' => 256,
                // Thinking models otherwise spend the token budget on internal reasoning
                // and return only a few words of visible text (finishReason MAX_TOKENS).
                'thinkingConfig' => [ 'thinkingBudget' => 0 ],
            ],
            'safetySettings' => [
                [ 'category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_NONE' ],
            ]
        ];

        $resultText = '';
        try {
            $ch = curl_init($endpoint);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [ 'Content-Type: application/json' ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $resp = curl_exec($ch);
            if ($resp === false) {
                throw new \Exception('curl error: ' . curl_error($ch));
            }
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            $json = json_decode($resp, true) ?: [];
            if ($status >= 200 && $status < 300) {
                $resultText = $this->extractGeminiText($json);
                if ($resultText === '') {
                    $finish = (string)($json['candidates'][0]['finishReason'] ?? '');
                    throw new \Exception('Empty model response' . ($finish !== '' ? " ($finish)" : ''));
                }
                // Enforce ~60 words server-side so UI always gets a full, bounded answer
                $words = preg_split('/\s+/u', $resultText, -1, PREG_SPLIT_NO_EMPTY) ?: [];
                if (count($words) > 60) {
                    $resultText = implode(' ', array_slice($words, 0, 60));
                    if (!preg_match('/[.!?]$/u', $resultText)) {
                        $resultText .= '.';
                    }
                }
            } else {
                $msg = $json['error']['message'] ?? ('HTTP ' . $status);
                throw new \Exception($msg);
            }
        } catch (\Throwable $e) {
            return new DataResponse([
                'ok' => false,
                'error' => 'Gemini request failed: ' . $e->getMessage(),
            ], Http::STATUS_BAD_GATEWAY);
        }

        return new DataResponse(['ok' => true, 'data' => ['text' => $resultText]]);
    }

    /**
     * Concatenate all text parts from the first candidate (thinking models may split output).
     *
     * @param array<string, mixed> $json
     */
    private function extractGeminiText(array $json): string {
        $parts = $json['candidates'][0]['content']['parts'] ?? [];
        if (!is_array($parts)) {
            return '';
        }
        $chunks = [];
        foreach ($parts as $part) {
            if (!is_array($part)) {
                continue;
            }
            $text = trim((string)($part['text'] ?? ''));
            if ($text !== '') {
                $chunks[] = $text;
            }
        }
        return trim(implode("\n", $chunks));
    }
}


