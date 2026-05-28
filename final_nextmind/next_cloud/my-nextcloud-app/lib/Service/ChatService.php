<?php
namespace OCA\MyNextcloudApp\Service;

use OCP\Files\IAppData;
use OCP\IL10N;

class ChatService {
    private const DATA_FOLDER = 'chat';
    private const MESSAGES_FILE_PREFIX = 'room_';
    private const PRESENCE_FILE = 'presence.json';

    public function __construct(
        private IAppData $appData,
        private IL10N $l10n,
    ) {}

    private function readJson(string $fileName): array {
        $folder = $this->appData->getFolder(self::DATA_FOLDER, true);
        if (!$folder->fileExists($fileName)) {
            return [];
        }
        $file = $folder->getFile($fileName);
        $stream = $file->read();
        $raw = stream_get_contents($stream) ?: '';
        fclose($stream);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    private function writeJson(string $fileName, array $data): void {
        $folder = $this->appData->getFolder(self::DATA_FOLDER, true);
        $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($folder->fileExists($fileName)) {
            $file = $folder->getFile($fileName);
            $file->putContent($payload);
        } else {
            $folder->newFile($fileName, $payload);
        }
    }

    private function messagesFileName(string $roomId): string {
        return self::MESSAGES_FILE_PREFIX . preg_replace('/[^a-zA-Z0-9_-]/', '_', $roomId) . '.json';
    }

    public function listMessages(string $roomId, ?int $sinceTs = null): array {
        $all = $this->readJson($this->messagesFileName($roomId));
        if ($sinceTs === null) {
            return $all;
        }
        return array_values(array_filter($all, static function(array $m) use ($sinceTs) {
            return isset($m['ts']) && (int)$m['ts'] > $sinceTs;
        }));
    }

    public function sendMessage(string $roomId, string $fromUserId, string $text): array {
        $messages = $this->readJson($this->messagesFileName($roomId));
        $message = [
            'id' => bin2hex(random_bytes(8)),
            'ts' => time(),
            'from' => $fromUserId,
            'text' => $text,
            'reactions' => [],
        ];
        $messages[] = $message;
        $this->writeJson($this->messagesFileName($roomId), $messages);
        return $message;
    }

    public function addReaction(string $roomId, string $messageId, string $userId, string $emoji): array {
        $messages = $this->readJson($this->messagesFileName($roomId));
        foreach ($messages as &$m) {
            if (($m['id'] ?? null) === $messageId) {
                if (!isset($m['reactions']) || !is_array($m['reactions'])) {
                    $m['reactions'] = [];
                }
                $key = $emoji;
                if (!isset($m['reactions'][$key]) || !is_array($m['reactions'][$key])) {
                    $m['reactions'][$key] = [];
                }
                if (!in_array($userId, $m['reactions'][$key], true)) {
                    $m['reactions'][$key][] = $userId;
                }
                $this->writeJson($this->messagesFileName($roomId), $messages);
                return $m;
            }
        }
        return [];
    }

    public function setPresence(string $roomId, string $userId, string $status): array {
        $presence = $this->readJson(self::PRESENCE_FILE);
        if (!isset($presence[$roomId]) || !is_array($presence[$roomId])) {
            $presence[$roomId] = [];
        }
        $presence[$roomId][$userId] = [
            'status' => $status,
            'ts' => time(),
        ];
        $this->writeJson(self::PRESENCE_FILE, $presence);
        return $presence[$roomId][$userId];
    }

    public function listPresence(string $roomId): array {
        $presence = $this->readJson(self::PRESENCE_FILE);
        $room = $presence[$roomId] ?? [];
        // drop stale entries older than 5 minutes
        $now = time();
        foreach ($room as $uid => $info) {
            if (($info['ts'] ?? 0) < ($now - 300)) {
                unset($room[$uid]);
            }
        }
        return $room;
    }
}




