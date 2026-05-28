<?php
$CONFIG = array (
  'htaccess.RewriteBase' => '/',
  'memcache.local' => '\\OC\\Memcache\\APCu',
  'apps_paths' => 
  array (
    0 => 
    array (
      'path' => '/var/www/html/apps',
      'url' => '/apps',
      'writable' => false,
    ),
    1 => 
    array (
      'path' => '/var/www/html/custom_apps',
      'url' => '/custom_apps',
      'writable' => true,
    ),
  ),
  'memcache.distributed' => '\\OC\\Memcache\\Redis',
  'memcache.locking' => '\\OC\\Memcache\\Redis',
  'redis' => 
  array (
    'host' => 'redis',
    'password' => '',
    'port' => 6379,
  ),
  'upgrade.disable-web' => true,
  'passwordsalt' => '9VMUXM9CUZW4I3KFn7UExLvfqU4FFt',
  'secret' => 'ZaG98Z191vNNgrJnTTxNRMvN+GQUsU7Kg8SEStXB9Y90oruT',
  'trusted_domains' => 
  array (
    0 => 'localhost',
    1 => 'localhost',
  ),
  'datadirectory' => '/var/www/html/data',
  'dbtype' => 'pgsql',
  'version' => '32.0.1.2',
  'overwrite.cli.url' => 'http://localhost:8081',
  'dbname' => 'nextcloud',
  'dbhost' => 'db',
  'dbtableprefix' => 'oc_',
  'dbuser' => 'oc_admin',
  'dbpassword' => 'KHtmEjAIfnjhFOaMAeNAQCx7ttN2cz',
  'installed' => true,
  'instanceid' => 'och7wbs11nh2',
  'maintenance' => false,
  'overwriteprotocol' => 'http',
  'overwritehost' => 'localhost:8081',
  'appstoreenabled' => true,
);
