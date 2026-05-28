<?php
namespace OCA\MyNextcloudApp\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class PageController extends Controller {
	public function __construct(string $AppName, IRequest $request) {
		parent::__construct($AppName, $request);
	}

	/**
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function index(): TemplateResponse {
		return new TemplateResponse('my-nextcloud-app', 'main', []);
	}

	/**
	 * Standalone widget view (no Nextcloud chrome). Useful for testing and embedding.
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function embed(): TemplateResponse {
		return new TemplateResponse('my-nextcloud-app', 'embed', []);
	}

	/**
	 * Proxy weather API to avoid CSP issues.
	 * @NoAdminRequired
	 * @NoCSRFRequired
	 */
	public function weather(): DataResponse {
		$city = $this->request->getParam('city', 'London');
		$apiKey = getenv('OPENWEATHER_API_KEY') ?: 'YOUR_OPENWEATHER_API_KEY';
		$url = 'https://api.openweathermap.org/data/2.5/weather?q=' . rawurlencode($city) . '&appid=' . rawurlencode($apiKey) . '&units=metric';
		$ctx = stream_context_create([
			'http' => [
				'timeout' => 5,
				'ignore_errors' => true,
			],
		]);
		$raw = @file_get_contents($url, false, $ctx);
		$data = $raw ? json_decode($raw, true) : ['error' => 'fetch_failed'];
		return new DataResponse($data);
	}
}
