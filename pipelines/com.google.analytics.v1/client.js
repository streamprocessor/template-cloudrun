function() {
	return function(model) {		
	    var globalSendTaskName = '_' + model.get('trackingId') + '_sendHitTask';
	    var originalSendHitTask = window[globalSendTaskName] = window[globalSendTaskName] || model.get('sendHitTask');
        var endpoint = "{{collectorEndpoint}}/subject/com.google.analytics.v1.transformed." + model.get('trackingId').toLowerCase() + ".Entity";
	    model.set('sendHitTask', function(sendModel) {
            try{
                originalSendHitTask(sendModel);
            }catch(e){
                console.log(e);
            }
            navigator.sendBeacon(endpoint, sendModel.get('hitPayload'));
		});
	};
}