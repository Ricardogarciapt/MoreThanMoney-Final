// Utility for tracking AI events
export async function trackAIEvent(
  eventType: string,
  eventData: Record<string, any> = {},
  context: Record<string, any> = {},
  aiFeature?: string,
  responseTime?: number,
  success: boolean = true,
  errorMessage?: string
) {
  try {
    const response = await fetch('/api/ai/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        event_data: eventData,
        context,
        ai_feature: aiFeature,
        response_time: responseTime,
        success,
        error_message: errorMessage,
      }),
    })

    if (!response.ok) {
      console.error('Failed to track AI event:', response.status, await response.text())
    }
  } catch (error) {
    console.error('Error tracking AI event:', error)
    // Don't throw - tracking failures shouldn't break the app
  }
}




