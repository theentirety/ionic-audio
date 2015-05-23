angular.module('ionic-audio', ['ionic'])
    .filter('time', function() {
        return function(input) {
            input = input || 0;

            var t = parseInt(input,10);

            var addLeadingZero = function(n) {
                return (n < 10) ? '0' + n : n;
            };
            return addLeadingZero(Math.floor(t / 60)) + ':' + addLeadingZero(t % 60);
        };
    })
    .filter('duration', function($filter) {
        return function (input) {
            return (input > 0) ? $filter('time')(input) : '';
        }
    })
    .factory('MediaManager', ['$interval', '$timeout', '$window', function($interval, $timeout, $window) {
        var tracks = [], currentTrack, currentMedia, playerTimer;

        if (!$window.cordova && !$window.Media) {
            console.log("ionic-audio: missing Cordova Media plugin. Have you installed the plugin? \nRun 'ionic plugin add org.apache.cordova.media'");
            return null;
        }

        var startTimer = function() {
            if ( angular.isDefined(playerTimer) ) return;

            if (!currentTrack) return;

            playerTimer = $interval(function() {
                if ( currentTrack.duration < 0){
                    currentTrack.duration = currentMedia.getDuration();
                }

                currentMedia.getCurrentPosition(
                    // success callback
                    function(position) {
                        if (position > -1) {
                            currentTrack.progress = position;
                        }
                    },
                    // error callback
                    function(e) {
                        console.log("Error getting pos=" + e);
                    });

                if (angular.isFunction(currentTrack.onProgress))
                    currentTrack.onProgress(currentTrack.progress, currentTrack.duration);

            }, 1000);

        };

        var stopTimer = function() {
            if (angular.isDefined(playerTimer)) {
                $interval.cancel(playerTimer);
                playerTimer = undefined;
            }
        };

        var releaseMedia = function() {
            if (angular.isDefined(currentMedia)) {
                currentMedia.release();
                currentMedia = undefined;
                currentTrack = undefined;
            }
        };

        var onSuccess = function() {
            stopTimer();
            releaseMedia();

            if (angular.isFunction(this.onSuccess))
                this.onSuccess();
        };

        var onError = function() {
            if (angular.isFunction(this.onError))
                this.onError();
        };

        var onStatusChange = function(status) {
            this.status = status;

            if (angular.isFunction(this.onStatusChange))
                this.onStatusChange(status);
        };

        var createMedia = function(track) {
            if (!track.url) {
                console.log('ionic-audio: missing track url');
                return undefined;
            }

            return new Media(track.url,
                angular.bind(track, onSuccess),
                angular.bind(track, onError),
                angular.bind(track, onStatusChange));

        };

        var destroy = function() {
            stopTimer();
            releaseMedia();
        };

        var stop = function() {
            console.log('ionic-audio: stopping track ' + currentTrack.title);
            currentMedia.stop();    // will call onSuccess...

            currentTrack = undefined;
        };

        var pause = function() {
            console.log('ionic-audio: pausing track '  + currentTrack.title);

            currentMedia.pause();
            stopTimer();
        };

        var resume = function() {
            console.log('ionic-audio: resuming track ' + currentTrack.title);

            currentMedia.play();
            startTimer();
        };

        var seekTo = function(pos) {
            if (!currentMedia) return;

            currentMedia.seekTo(pos * 1000);
        };


        var play = function(track) {
            currentTrack = track;

            console.log('ionic-audio: playing track ' + currentTrack.title);

            currentMedia = createMedia(currentTrack);
            currentMedia.play();

            startTimer();

        };

        /*
        Creates a new Media from a track object

         var track = {
             url: 'https://s3.amazonaws.com/ionic-audio/Message+in+a+bottle.mp3',
             artist: 'The Police',
             title: 'Message in a bottle',
             art: 'img/The_Police_Greatest_Hits.jpg'
         }
         */
        return {
            add: function(track, playbackSuccess, playbackError, statusChange, progressChange) {
                if (!track.url) {
                    console.log('ionic-audio: missing track url');
                    return;
                }
                angular.extend(track, {
                    onSuccess: playbackSuccess,
                    onError: playbackError,
                    onStatusChange: statusChange,
                    onProgress: progressChange,
                    status: 0,
                    duration: -1,
                    progress: 0
                });

                track.id  = tracks.push(track) - 1;
                return track.id;
            },

            play: function(trackID) {

                // avoid two tracks playing simultaneously
                if (currentTrack) {
                    if (currentTrack.id == trackID) {
                        if (currentTrack.status == Media.MEDIA_RUNNING) {
                            pause();
                        } else {
                            //if (currentTrack.status == Media.MEDIA_PAUSED) {
                                resume();
                            //}
                        }
                        return;
                    } else {
                        if (currentTrack.id > -1) {
                            stop();
                        }
                    }
                }

                $timeout(function() {
                    play(tracks[trackID]);
                }, 1000);

            },

            pause: function() {
                pause();
            },

            seekTo: function(pos) {
                seekTo(pos);
            },

            destroy: function() {
                destroy();
            }

        }

    }])
    .directive('ionAudioTrack', ['MediaManager', '$rootScope', function(MediaManager, $rootScope) {
        return {
            transclude: true,
            template: '<ng-transclude></ng-transclude>',
            restrict: 'E',
            scope: {
                track: '='
            },
            controller: ['$scope', function($scope) {
                var controller = this;

                var playbackSuccess = function() {
                    $scope.track.status = 0;
                    $scope.track.progress = 0;
                };
                var statusChange = function(status) {
                    $scope.track.status = status;
                };
                var progressChange = function(progress, duration) {
                    $scope.track.progress = progress;
                    $scope.track.duration = duration;
                };
                var notifyProgressBar = function() {
                    $rootScope.$broadcast('ionic-audio:trackChange', $scope.track);
                };

                this.seekTo = function(pos) {
                    MediaManager.seekTo(pos);
                };

                this.play = function() {
                    MediaManager.play($scope.track.id);
                    if (!controller.hasOwnProgressBar) notifyProgressBar();
                    return $scope.track.id;
                };

                this.getTrack = function() {
                    return $scope.track;
                };

                $scope.track.id = MediaManager.add($scope.track, playbackSuccess, null, statusChange, progressChange);

            }],
            link: function(scope, element, attrs, controller) {
                controller.hasOwnProgressBar = element.find('ion-audio-progress-bar').length > 0;

                scope.$on('$destroy', function() {
                    MediaManager.destroy();
                });
            }
        }
    }])
    .directive('ionAudioPlay', ['$ionicPlatform', function($ionicPlatform) {
        return {
            restrict: 'EA',
            transclude: true,
            template: '<ng-transclude></ng-transclude><ion-spinner icon="ios" class="ng-hide"></ion-spinner>',
            require: '^^ionAudioTrack',
            link: function(scope, element, attrs, controller) {
                var
                    playElem = element.find('a'), spinnerElem = element.find('ion-spinner'), hasLoaded;

                spinnerElem.css({position: 'relative', top: '8px', left: '8px;'});

                function toggleSpinner() {
                    spinnerElem.toggleClass('ng-hide');
                }

                function togglePlayButton(hasStopped) {
                    if (hasStopped) {
                        playElem.addClass('ion-play').removeClass('ion-pause');
                    } else {
                        playElem.toggleClass('ion-play ion-pause');
                    }
                }

                $ionicPlatform.ready(function() {
                    element.on('click', function() {
                        if (!hasLoaded) toggleSpinner();

                        // call main directive's play method
                        controller.play();
                    });

                    scope.$watch('track.status', function (status) {
                        switch (status) {
                            case Media.MEDIA_STARTING:
                                hasLoaded = false;
                                break;
                            case Media.MEDIA_PAUSED:
                                togglePlayButton();
                                break;
                            case Media.MEDIA_RUNNING:
                                if (!hasLoaded) {
                                    toggleSpinner();
                                    hasLoaded = true;
                                }
                                togglePlayButton();
                                break;
                            case Media.MEDIA_NONE:
                            case Media.MEDIA_STOPPED:
                                hasLoaded = false;
                                togglePlayButton(true);
                                break;
                        }
                    });
                });
            }
        }
    }])
    .directive('ionAudioProgressBar', ['MediaManager', function(MediaManager) {
        return {
            restrict: 'E',
            template:
                '<h2 class="ion-audio-track-info" ng-style="displayTrackInfo()">{{track.title}} - {{track.artist}}</h2>' +
                '<div class="range">' +
                '<ion-audio-progress track="track"></ion-audio-progress>' +
                '<input type="range" name="volume" min="0" max="{{track.duration}}" ng-model="track.progress" on-release="sliderRelease()" disabled>' +
                '<ion-audio-duration track="track"></ion-audio-duration>' +
                '</div>',
            require: '?^^ionAudioTrack',
            scope: {},
            link: function(scope, element, attrs, controller) {
                var slider =  element.find('input');

                scope.track = {
                    progress: 0,
                    status: 0,
                    duration: -1
                };

                if (!angular.isDefined(attrs.displayTime)) {
                    element.find('ion-audio-progress').remove();
                    element.find('ion-audio-duration').remove();
                }
                if (!angular.isDefined(attrs.displayInfo)) {
                    element.find('h2').remove();
                }

                scope.displayTrackInfo = function() {
                    return { visibility: angular.isDefined(attrs.displayInfo) && (scope.track.title || scope.track.artist) ? 'visible' : 'hidden'}
                };

                scope.$watch('track.status', function(status) {
                    if (status == 2) {  //   Media.MEDIA_RUNNING
                        slider.removeAttr('disabled');
                    } else {
                        slider.prop("disabled", true);
                    }
                });

                scope.$on('$destroy', function() {
                    MediaManager.destroy();
                });

                var registerTrackListener = function() {
                    scope.$on('ionic-audio:trackChange', function (e, track) {
                        scope.track = track;
                    });
                };

                if (controller) {
                    scope.track = controller.getTrack();
                } else {
                    registerTrackListener();
                }

                scope.sliderRelease = function() {
                    var pos = scope.track.progress;
                    if (scope.track.status != 2)    //   Media.MEDIA_RUNNING
                        return;

                    MediaManager.seekTo(pos);
                };
            }
        }
    }])
    .directive('ionAudioProgress', [function() {
        return {
            restrict: 'E',
            scope: {
                track: '='
            },
            template: '{{track.progress | time}}',
            link: function(scope, element, attrs) {
            }
        }
    }])
    .directive('ionAudioDuration', [function() {
        return {
            restrict: 'E',
            scope: {
                track: '='
            },
            template: '{{track.duration | duration}}',
            link: function(scope, element, attrs) {
            }
        }
    }]);