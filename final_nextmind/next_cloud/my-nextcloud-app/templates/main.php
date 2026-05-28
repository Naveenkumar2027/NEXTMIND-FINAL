<?php
/** @var array $_ */
/** @var \OCP\IL10N $l */
\OCP\Util::addScript('my-nextcloud-app', 'main.bundle');
// Cache-bust by app version to ensure latest JS is served
\OCP\Util::addHeader('link', [
    'rel' => 'preload',
    'href' => \OCP\Util::linkTo('my-nextcloud-app', 'js/main.bundle.js') . '?v=' . \OC_App::getAppVersion('my-nextcloud-app'),
    'as' => 'script',
]);
?>
<div id="app-content">
	<div class="section">
		<h2><?php p($l->t('Welcome to My Nextcloud App!')); ?></h2>
		<p><?php p($l->t('This is a sample Nextcloud app created manually.')); ?></p>
	</div>
</div>
