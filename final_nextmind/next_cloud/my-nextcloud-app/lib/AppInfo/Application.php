<?php
namespace OCA\MyNextcloudApp\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\IAppContainer;
use OCP\Files\IAppData;
use OCP\IL10N;
use OCP\IUserSession;
use OCA\MyNextcloudApp\Service\ChatService;
use OCA\MyNextcloudApp\Controller\ChatController;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
	public const APP_ID = 'my-nextcloud-app';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
		$container = $this->getContainer();

		$container->registerService(ChatService::class, function(IAppContainer $c) {
			return new ChatService(
				$c->query(IAppData::class),
				$c->query(IL10N::class),
			);
		});

		$container->registerService(ChatController::class, function(IAppContainer $c) {
			return new ChatController(
				self::APP_ID,
				$c->query('Request'),
				$c->query(ChatService::class),
				$c->query(IUserSession::class),
			);
		});
	}

	public function register(IRegistrationContext $context): void {
		// no-op
	}

	public function boot(IBootContext $context): void {
		// Enqueue widget bundle globally (Dashboard + other pages)
		\OCP\Util::addScript(self::APP_ID, 'main.bundle');
	}
}
