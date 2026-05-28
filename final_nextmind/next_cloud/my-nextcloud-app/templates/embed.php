<?php
\OCP\Util::addScript('my-nextcloud-app', 'main.bundle');
?><!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Widget</title>
	<style>
		html,body{height:100%;margin:0;padding:0;background:transparent}
	</style>
</head>
<body>
<div id="talk-widget-mount"></div>
<script>
// Ensure the widget mounts immediately in the embed view
document.addEventListener('DOMContentLoaded', function(){
	if (!document.getElementById('talk-widget-mount')) {
		var mount = document.createElement('div');
		mount.id = 'talk-widget-mount';
		document.body.appendChild(mount);
	}
});
</script>
</body>
</html>


